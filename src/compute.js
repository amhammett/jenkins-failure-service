'use strict'

const AWS_DEFAULT_REGION = process.env.AWS_DEFAULT_REGION
const SUBSCRIPTION_ENDPOINT = process.env.SUBSCRIPTION_ENDPOINT
const LOG_RETRIEVE_ENDPOINT = process.env.LOG_RETRIEVE_ENDPOINT
const EMAIL_ENDPOINT = process.env.EMAIL_ENDPOINT
const max_log_length = 10

const async = require('async')
const AWS = require('aws-sdk');

if (!AWS.config.region && AWS_DEFAULT_REGION) {
  AWS.config.update({
    region: AWS_DEFAULT_REGION
  });
}

let lambda = new AWS.Lambda();
let kinesis = new AWS.Kinesis();

let queue_email = (email_data) => {
  console.log(email_data)
  let kinesis_params = {
    StreamName: EMAIL_ENDPOINT,
    Data: JSON.stringify(email_data),
    PartitionKey: 'lambda-event'
  }

  kinesis.putRecord(kinesis_params, function(error, data) {
    if(error) {
      console.error('Error submitting email request: ' + error.message)
      callback(error)
    }

    console.log('Submitted request to ' + EMAIL_ENDPOINT)
    console.log(email_data)
  })  
}

let format_email = (subscription_list, email_text, callback) => {
  let email_data = {
    from: 'andrew.hammett@sony.com', //generate_reply_email(event_data.build.full_url),
    to: 'andrew.hammett@sony.com', //subscription.email,
    subject: 'test email', //generate_subject(event_data),
    text: email_text
  }
  callback(null, email_data)
}


let build_data = (record, subscription_list, callback) => {
  let payload = JSON.stringify({
    'build_number': 1, //event_data.build.number,
    'job_url':      'asdf' //event_data.url
  })

  lambda.invoke({
    FunctionName: LOG_RETRIEVE_ENDPOINT,
    Payload: payload
  }, function(error, data) {
    if (error) {
      callback(error)
    }

    let log_data = JSON.parse(data.Payload)
    let email_text

    if(log_data.body) {
      email_text = log_data.body
    } else {
      email_text = 'no logs found'
    }
    callback(null, subscription_list, email_text)
  })
}

let subscription_data = (record, callback) => {
  lambda.invoke({
    FunctionName: SUBSCRIPTION_ENDPOINT,
    Payload: ''
  }, function(error, data) {
    if (error) {
      console.log('try')
      callback(error)
      return
    }

    try {
      let subscription_payload = JSON.parse(data.Payload)

      if(subscription_payload.errorMessage) {
        console.error('Unable to retrieve subscription data')
        throw subscription_payload.errorMessage
      }
      let subscription_list = JSON.parse(subscription_payload.body)

      console.log('try')
      callback(null, record, subscription_list)

    } catch(e) {
      console.log('try:'+ e)

      callback('Error with payload: ' + e)
    }
  })
}

module.exports.compute = (event, context, callback) => {
  async.each(event.Records, function(record, callback) {
    // this doesn't need to be waterfall ()
    async.waterfall([
      async.apply(subscription_data, record),
      build_data,
      format_email
    ], function(error, email_data) {
      if(error){
        console.error(error)
        context.fail(error, '¯\\_(ツ)_/¯')
      } else {
        console.log(email_data)
        queue_email(email_data)
        context.succeed()
      }
    })
  })
}

/*

let process_failure_record = (record) => {
  let record_data = new Buffer((record.kinesis.data), 'base64').toString("ascii");
  let kinesis_data = JSON.parse(record_data)
  let event_data = JSON.parse(kinesis_data.body)

  
  lambda.invoke({
    FunctionName: SUBSCRIPTION_ENDPOINT,
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

        subscriptions.forEach(function(subscription) {
          if(users_subscribed_to_job(event_data.name, subscription.pattern)) {

            let jlr_lambda = new AWS.Lambda();
            let jlr_payload = JSON.stringify({
              'build_number': event_data.build.number,
              'job_url':      event_data.url
            })
            // console.log(jlr_payload)

            jlr_lambda.invoke({
              FunctionName: log_retrieve_endpoint,
              Payload: jlr_payload
            }, function(error, jlr_data) {
              if (error) {
                console.error(error)
                return;
              }

              let log_data = JSON.parse(jlr_data.Payload)
              let log_text = 'no logs found'

              if(log_data.body && log_data.body != 'empty') {
                console.log(log_data.body)
                log_text = log_data.body
              } else {
                console.log('no logs')
              }

              let email_data = {
                from: generate_reply_email(event_data.build.full_url),
                to: subscription.email,
                subject: generate_subject(event_data),
                text: log_text
              }

              let kinesis_params = {
                StreamName: EMAIL_ENDPOINT,
                Data: JSON.stringify(email_data),
                PartitionKey: 'jfs-lambda-event'
              }

              let kinesis = new AWS.Kinesis();
              kinesis.putRecord(kinesis_params, function(err, data) {
                if(err) {
                  console.error('Error submitting email request: '+ err.message)
                } else {
                  console.log('Submitted request to ' + EMAIL_ENDPOINT)
                  console.log(email_data)
                }
              })
            });
          }
        });
      }
    }
  });
}
*/

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

let users_subscribed_to_job = (job_name, pattern) => {
  let pattern_search = false
  try {
    pattern_search = (job_name).search(pattern)
    pattern_search = true
  } catch (err) {
    console.error('invalid search pattern provided')
  }
  return pattern_search
}