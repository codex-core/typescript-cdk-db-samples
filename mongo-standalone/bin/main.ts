#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { MongoDBStandalone } from '../lib/mongodb-standalone-stack';

const app = new cdk.App();
new MongoDBStandalone(app, 'MongoDBStandaloneStack', {});