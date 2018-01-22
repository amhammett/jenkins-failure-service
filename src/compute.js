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

let email_queue = (email_data, callback) => {
  console.log(email_data)
  let kinesis_params = {
    StreamName: EMAIL_ENDPOINT,
    Data: JSON.stringify(email_data),
    PartitionKey: 'lambda-event'
  }

  kinesis.putRecord(kinesis_params, function(err, data) {
    if(err) {
      console.error('Error submitting email request: ' + err.message)
      callback(err)
    }

    console.log('Submitted request to ' + EMAIL_ENDPOINT)
    console.log(email_data)
  })  
}

let email_format = (to_email, from_email, subject, email_text, callback) => {
  let email_data = {
    from: from_email,
    to: to_email,
    subject: subject,
    text: email_text
  }
  callback(null, email_data)
}

let user_subscribed = (job_name, pattern) => {
  let pattern_search = false
  try {
    pattern_search = (job_name).search(pattern) != -1
  } catch (err) {
    console.error('invalid search pattern provided')
  }
  return pattern_search
}

let jenkins_instance_name = (url) => {
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

let email_subject = (data, callback) => {
  let subject = 'Failure detected in ' + data.name + ' #' + data.build.number
  callback(null, subject)
}

let email_from_address = (url, callback) => {
  let from_address = jenkins_instance_name(url) + ' <no-reply@'+url.split('/')[2].split(':')[0]+'>'
  callback(null, from_address)
}

let build_logs = (event_data, callback) => {
  let payload = JSON.stringify({
    'build_number': event_data.build.number,
    'job_url':      event_data.url
  })

  lambda.invoke({
    FunctionName: LOG_RETRIEVE_ENDPOINT,
    Payload: payload
  }, function(err, data) {
    if (err) {
      callback(err)
    }

    let log_data = JSON.parse(data.Payload)
    let email_text

    if(log_data.body) {
      email_text = log_data.body
    } else {
      email_text = 'no logs found'
    }

    callback(null, email_text)
  })
}

let job_subscription = (callback) => {
  lambda.invoke({
    FunctionName: SUBSCRIPTION_ENDPOINT,
    Payload: ''
  }, function(err, data) {
    if (err) {
      callback(err)
    }

    try {
      let subscription_payload = JSON.parse(data.Payload)

      if(subscription_payload.errorMessage) {
        console.error('Unable to retrieve subscription data')
        throw subscription_payload.errorMessage
      }

      callback(null, JSON.parse(subscription_payload.body))
    } catch(e) {
      console.log('try:'+ e)

      callback('Error with payload: ' + e)
    }
  })
}

module.exports.compute = (event, context, callback) => {
  async.each(event.Records, function(record, callback) {
    let record_data = new Buffer((record.kinesis.data), 'base64').toString("ascii");
    let kinesis_data = JSON.parse(record_data)
    console.log(kinesis_data)
    let event_data = JSON.parse(kinesis_data.body)

    async.series([
      job_subscription,
      async.apply(build_logs, event_data),
      async.apply(email_from_address, event_data.build.full_url),
      async.apply(email_subject, event_data)
    ], function(err, results) {
      if(err){
        console.error(err)
        context.fail(err, '¯\\_(ツ)_/¯')
        return
      }
      let subscriptions = results[0]
      let build_logs = results[1]
      let from_address = results[2]
      let subject = results[3]

      async.each(results[0], function(subscription, callback) {
        if(user_subscribed(event_data.name, subscription.pattern)) {

          let from_address = results[2]
          let subject = results[3]
          let build_logs = results[1]

          async.waterfall([
            async.apply(email_format, subscription.email, from_address, subject, build_logs),
            email_queue
          ], function(err, email_data) {
            if(err){
              console.error(err)
              context.fail(err, '¯\\_(ツ)_/¯')
            } else {
              context.succeed()
            }
          })
        }
      })
    })
  })
}