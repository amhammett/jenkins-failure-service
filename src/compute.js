'use strict';

const https = require('https');
const AWS = require('aws-sdk');

const aws_default_region = process.env.AWS_DEFAULT_REGION
if (!AWS.config.region && aws_default_region) {
  AWS.config.update({
    region: aws_default_region
  });
}

const allow_cidr = process.env.ALLOW_CIDR || 'x.x.x.x'
const failure_endpoint = process.env.FAILURE_ENDPOINT
const subscription_endpoint = process.env.SUBSCRIPTION_ENDPOINT || 'jes-hmt-v1-list'
const email_stream = process.env.EMAIL_ENDPOINT || 'yams-hmt1-v1-send'

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
  let kinesis_data = new Buffer(
    JSON.stringify(record.Data), 'base64'
  ).toString("ascii");
  let data = JSON.parse(kinesis_data)
  let lambda = new AWS.Lambda();

  lambda.invoke({
    FunctionName: subscription_endpoint,
    Payload: ''
  }, function(error, sub_data) {
    if (error) {
      console.error(error)
    }

    if(sub_data.Payload) {
      let records = JSON.parse(JSON.parse(sub_data.Payload).body)
      let email_subject = generate_subject(data)
      let email_from = generate_reply_email(data.build.full_url)
      let email_body = scrape_logs(data.build.full_url)

      records.forEach(function(record) {
        if((data.name).search(record.pattern) !== -1) {
          let email_data = {
            sender: email_from,
            receiver: record.email,
            subject: email_subject,
            body: email_body
          }

          let kinesis_params = {
            StreamName: email_stream,
            Data: JSON.stringify(email_data),
            PartitionKey: 'jfs-lambda-event'
          }
          var kinesis = new AWS.Kinesis();

          kinesis.putRecord(kinesis_params, function(err, data) {
            if(err) {
              console.error('Error submitting email request: '+err.message)
            }
          })
        }
      });
    }
  });
}

module.exports.compute = (event, context, callback) => {
  let found = false;
  let sourceIP = event['requestContext']
    && event['requestContext']['identity']['sourceIp'] || 'local'

  allow_cidr.split(' ').forEach(function(allow_mask) {
    if(sourceIP.includes(allow_mask)) {
      found = true
    }
  });

  if (!found && sourceIP !== 'local' && sourceIP !== 'test-invoke-source-ip') {
    console.error('Requestor not in allow list')

    callback(null, {
      statusCode: 403,
      headers: { 'Content-Type': 'text/plain' },
      body: '¯\\_(ツ)_/¯'
    });
    return;
  }

  if(event.Records) {
    event.Records.forEach(function(record) {
      if(!process_failure_record(record)) {
        console.log('There was a problem submitting message')
      }
    });
  }

  callback(null, {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Greatness awaits.'
  });
  return;
}
