
function_name = jfs

env := missing
profile := sms-dev
region := us-east-1
stage := v1

AWS_PARAMS=AWS_PROFILE=$(profile) AWS_DEFAULT_REGION=${region}
LAMBDA_PARAMS=ENV=${env} SUBSCRIPTION_ENDPOINT=${subscription_endpoint}

local-invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/lambda-local -t 20 -f $(function_file) -e $(event_file)

deploy:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless deploy --stage ${stage}

invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless invoke --stage ${stage} -f $(function_name)

remove:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless remove --stage ${stage}
