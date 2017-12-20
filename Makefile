
function_name = jfs

env := missing
profile := sms-dev
region := us-east-1
stage := v1
allow_cidr := x.x.x.x

AWS_PARAMS=AWS_PROFILE=$(profile) AWS_DEFAULT_REGION=${region}
LAMBDA_PARAMS=ALLOW_CIDR="$(allow_cidr)" ENV=${env} FAILURE_ENDPOINT=${failure_endpoint}

local-invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/lambda-local -t 20 -f $(function_file) -e $(event_file)

deploy:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless deploy --stage ${stage}

invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless invoke --stage ${stage} -f $(function_name)

remove:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless remove --stage ${stage}
