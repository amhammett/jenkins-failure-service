
function_name = jfs

env := missing
profile := sms-dev
region := us-west-2
stage := v1
vpc_env := dev
jenkins_port := 80

AWS_PARAMS=AWS_PROFILE=$(profile) AWS_DEFAULT_REGION=${region}

vpc_id := $(shell ${AWS_PARAMS} aws ec2 describe-vpcs --filters "Name=tag:Environment,Values=${vpc_env}" --query Vpcs[0].VpcId --output text)
subnet_ids := $(shell ${AWS_PARAMS} aws ec2 describe-subnets --filters "Name=vpc-id,Values=${vpc_id}" --query Subnets[*].SubnetId --output text)

LAMBDA_PARAMS=ENV=${env} VPC_ID=${vpc_id} VPC_SUBNETS="${subnet_ids}"
#  JENKINS_PORT=${jenkins_port}

local-invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/lambda-local -t 20 -f $(function_file) -e $(event_file)

deploy:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless deploy --stage ${stage}

invoke:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless invoke --stage ${stage} -f $(function_name)

remove:
	${AWS_PARAMS} ${LAMBDA_PARAMS} ./node_modules/.bin/serverless remove --stage ${stage}
