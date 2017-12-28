'use strict';

const AWS = require('aws-sdk');

const aws_default_region = process.env.AWS_DEFAULT_REGION
if (!AWS.config.region && aws_default_region) {
  AWS.config.update({
    region: aws_default_region
  });
}

const env_name = process.env.ENV_NAME
const subscription_endpoint = process.env.SUBSCRIPTION_ENDPOINT
const email_stream = process.env.EMAIL_ENDPOINT

let generate_jenkins_name = (url) => {
  let name = url.split('/')[2].split(':')[0].split('.')[0]
  let replace_tokens = {
    sm: 'Santa Monica',
    cimaster: 'CI Master',
    jenkinsmaster: 'Jenkins Master',
    localhost: 'Jenkins Local'
  }
  Object.keys(replace_tokens).forEach(function (key) {
    name = name.replace(key, replace_tokens[key])
  })
  return name.replace(/-/g, ' ');
}

let generate_reply_email = (url) => {
  return generate_jenkins_name(url)+' <no-reply@'+url.split('/')[2].split(':')[0]+'>'
}

let generate_subject = (data) => {
  return 'Failure detected in '+data.name+' #'+data.build.number
}

let scrape_logs = (url) => {
  return 'no logs found'
}

let process_failure_record = (record) => {
  let record_data = new Buffer((record.kinesis.data), 'base64').toString("ascii");
  let kinesis_data = JSON.parse(record_data)
  let event_data = JSON.parse(kinesis_data.body)

  let lambda = new AWS.Lambda();
  lambda.invoke({
    FunctionName: subscription_endpoint,
    Payload: ''
  }, function(error, sub_data) {
    if (error) {
      console.error(error)
    }

    if(sub_data.Payload) {
      let subscription_data = JSON.parse(sub_data.Payload)

      if(subscription_data.errorMessage) {
        console.error('Unable to retrieve subscription data')
        console.error(subscription_data.errorMessage)
      } else {
        let subscriptions = JSON.parse(subscription_data.body)
        let email_subject = generate_subject(event_data)
        let email_from = generate_reply_email(event_data.build.full_url)
        let email_body = scrape_logs(event_data.build.full_url)

        subscriptions.forEach(function(subscription) {
          console.log('subscription each..')
          console.log(subscription)

          let pattern_search = -1
          try {
            pattern_search = (event_data.name).search(subscription.pattern)
          } catch (err) {
            console.error('invalid search pattern provided')
          }

          if(pattern_search !== -1) {
            let email_data = {
              from: email_from,
              to: subscription.email,
              subject: email_subject,
              body: email_body
            }

            let kinesis_params = {
              StreamName: email_stream,
              Data: JSON.stringify(email_data),
              PartitionKey: 'jfs-lambda-event'
            }
            let kinesis = new AWS.Kinesis();
            kinesis.putRecord(kinesis_params, function(err, data) {
              if(err) {
                console.error('Error submitting email request: '+err.message)
              } else {
                console.log('Submitted request to ' + email_stream)
                console.log(email_data)
              }
            })
          }
        });
      }
    }
  });
}

module.exports.compute = (event, context, callback) => {
  if(event.Records) {
    event.Records.forEach(function(record) {
      console.log('processing record')
      process_failure_record(record)
    });
  } else {
    console.error('no data found')
  }

  callback(null, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Greatness awaits.'
  });
  return;
}
