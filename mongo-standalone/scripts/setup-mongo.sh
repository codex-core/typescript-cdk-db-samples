#!/bin/bash

# Set AWS Region for AWS CLI
export AWS_DEFAULT_REGION=us-east-1

# Add MongoDB repository
echo "[mongodb-org-4.4]
name=MongoDB Repository
baseurl=https://repo.mongodb.org/yum/amazon/2/mongodb-org/4.4/x86_64/
gpgcheck=1
enabled=1
gpgkey=https://www.mongodb.org/static/pgp/server-4.4.asc" | sudo tee /etc/yum.repos.d/mongodb-org-4.4.repo

# Update and install MongoDB, AWS CLI, and jq
sudo yum update -y
sudo yum install -y mongodb-org aws-cli jq

# Start MongoDB
sudo service mongod start
sudo chkconfig mongod on

# Wait for MongoDB to start up
sleep 20

# Retrieve MongoDB credentials from AWS Secrets Manager
MONGO_CREDENTIALS=$(aws secretsmanager get-secret-value --secret-id mongodb/credentials --query SecretString --output text)
MONGO_USERNAME=$(echo $MONGO_CREDENTIALS | jq -r .username)
MONGO_PASSWORD=$(echo $MONGO_CREDENTIALS | jq -r .password)

# MongoDB commands to setup database, collection, and user
mongo <<EOF
use ctc-db

// Create a collection
db.createCollection("users")

// Create a user with the password from Secrets Manager
db.createUser({
user: '$MONGO_USERNAME',
pwd: '$MONGO_PASSWORD',
roles: [
{ role: 'readWrite', db: 'yourDatabaseName' }
]
})

EOF