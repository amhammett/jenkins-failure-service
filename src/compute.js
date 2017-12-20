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

let process_failure_record = (record) => {
  let kinesis_data = new Buffer(
    JSON.stringify(record.Data), 'base64'
  ).toString("ascii");

  let data = JSON.parse(kinesis_data)
  let full_url = data.build.full_url
  
  console.log(full_url)
}

module.exports.compute = (event, context, callback) => {
  var found = false;
  var sourceIP = event['requestContext']
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
      process_failure_record(record)
    });
  }

  callback(null, {
    statusCode: 418,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Greatness awaits.'
  });
  return;
}
