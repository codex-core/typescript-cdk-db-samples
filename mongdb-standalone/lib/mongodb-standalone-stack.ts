import * as cdk from "aws-cdk-lib";
import {
  Tags as tags,
  aws_ec2 as ec2,
  aws_iam as iam,
  aws_secretsmanager as secretsmanager,
} from "aws-cdk-lib";
import { ISecurityGroup, Vpc } from "aws-cdk-lib/aws-ec2";

import { Construct } from "constructs";
import * as fs from "fs";

export class MongoDBStandalone extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);
    const ec2Name = "mongodb-instance";

    // Create a VPC
    const vpcId = cdk.Fn.importValue("CTC:vpcId");

    const vpc = ec2.Vpc.fromVpcAttributes(this, "vpc", {
      vpcId,
      availabilityZones: ["us-east-1a"],
    });

    // Create a private subnet
    let selectedSubnets: ec2.SubnetSelection | undefined;

    const instanceSubnetId = cdk.Fn.importValue("CTC:PrivateSubnet0");

    //Private subnet
    const subnetFromAttributes = ec2.Subnet.fromSubnetAttributes(
      this,
      `mongodb-subnet-1`,
      {
        subnetId: instanceSubnetId,
        availabilityZone: "us-east-1a",
      }
    );
    selectedSubnets = {
      subnets: [subnetFromAttributes],
    };
    // Create a Security Group
    const securityGroup = new ec2.SecurityGroup(this, "MongoDBSecurityGroup", {
      vpc,
      description: "Allow access from ECS clusters or Lambda",
      allowAllOutbound: true, // Can be set to false if needed
      securityGroupName: `${ec2Name}-sg`,
    });

    // EC2 Instance role and policy
    const role = new iam.Role(this, "MongoDbInstanceRole", {
      assumedBy: new iam.ServicePrincipal("ec2.amazonaws.com"),
    });

    const ssmPolicyDoc = new iam.PolicyDocument({
      statements: [
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          actions: [
            "ssm:UpdateInstanceInformation",
            "ssmmessages:CreateControlChannel",
            "ssmmessages:CreateDataChannel",
            "ssmmessages:OpenControlChannel",
            "ssmmessages:OpenDataChannel",
          ],
          resources: ["*"],
        }),
      ],
    });
    const ssmPolicy = new iam.Policy(this, "ssmPolicy", {
      document: ssmPolicyDoc,
    });
    role.attachInlinePolicy(ssmPolicy);

    const keyPair = this.initKeyPair();

    const userDataFile = "scripts/setup-mongo.sh";
    const userData = fs.readFileSync(userDataFile, "utf8");
    // EC2 Instance
    const instance = new ec2.Instance(this, "MongoDBInstance", {
      vpc,
      instanceName: ec2Name,
      instanceType: new ec2.InstanceType("t3.micro"), // Change as per your requirement
      machineImage: ec2.MachineImage.latestAmazonLinux2(),
      vpcSubnets: selectedSubnets,
      securityGroup: securityGroup,
      role: role,
      keyName: keyPair.keyName,
      blockDevices: [
        {
          deviceName: "/dev/xvda",
          volume: ec2.BlockDeviceVolume.ebs(100),
        },
      ],
    });
    // Create a secret in AWS Secrets Manager
    const mongoDbCredentials = new secretsmanager.Secret(
      this,
      "MongoDBCredentials",
      {
        secretName: "mongodb/credentials",
        generateSecretString: {
          secretStringTemplate: JSON.stringify({ username: "main_user" }),
          generateStringKey: "password",
          excludePunctuation: true,
          includeSpace: false,
        },
      }
    );

    // Grant the EC2 instance access to the secret
    mongoDbCredentials.grantRead(role);
    // User Data script to install MongoDB

    tags.of(instance).add("ec2Name", ec2Name);
    new cdk.CfnOutput(this, "ec2-instance-id", {
      value: instance.instanceId,
      exportName: "mongodb-ec2-instance-id",
    });
    new cdk.CfnOutput(this, "mongodb-ec2-instance-public-dnsname", {
      value: instance.instancePublicDnsName,
    });
    instance.addUserData(userData);
  }

  initKeyPair() {
    const keyName = "mongodb-key-pair";
    const cfnKeyPair = new ec2.CfnKeyPair(this, "mongodbCFNKeyPair", {
      keyName: keyName,

      // the properties below are optional
      keyFormat: "pem",
      keyType: "rsa",
      // publicKeyMaterial: 'publicKeyMaterial',
      tags: [
        {
          key: "Name",
          value: keyName,
        },
      ],
    });
    return cfnKeyPair;
  }
}
