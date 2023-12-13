import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
    ProviderAttribute,
    UserPool,
    UserPoolClientIdentityProvider,
    UserPoolIdentityProviderGoogle
} from "aws-cdk-lib/aws-cognito";
import { Secret } from "aws-cdk-lib/aws-secretsmanager";
import {
    Cluster,
    ContainerDependencyCondition,
    ContainerImage, CpuArchitecture,
    FargateService,
    FargateTaskDefinition,
    LogDriver
} from "aws-cdk-lib/aws-ecs";
import { Port, SubnetType, Vpc } from "aws-cdk-lib/aws-ec2";
import { DockerImageAsset } from "aws-cdk-lib/aws-ecr-assets";
import * as path from "path";
import { HostedZone } from "aws-cdk-lib/aws-route53";
import { URL } from "url";
import { PublicIPSupport } from "@raykrueger/cdk-fargate-public-dns";
import { LogGroup, RetentionDays } from "aws-cdk-lib/aws-logs";

export class CognitoGoogleAuthNestJs extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        const vpc = new Vpc(this, 'vpc', {
            natGateways: 0,
        })

        const userPool = new UserPool(this, 'users', {
            selfSignUpEnabled: true,
            signInAliases: { email: true }
        });

        const hostedZone = HostedZone.fromLookup(this, 'tutorial.bright.dev', {
            domainName: 'tutorial.bright.dev'
        });
        const baseNestJsUrl = new URL(`https://google-cognito-nestjs.${hostedZone.zoneName}`);
        const callbackUrl = new URL("/auth/callback", baseNestJsUrl)

        const userPoolDomain = userPool.addDomain('backend', {
            cognitoDomain: {
                domainPrefix: "tutorial-google-bright"
            }
        });

        new CfnOutput(this, 'user-pool-domain-uri', {
            value: userPoolDomain.baseUrl()
        })

        const clientCredentials = Secret.fromSecretNameV2(this, 'google-client-credentials', 'cognito-google-oauth-credentials')

        const identityProviderGoogle = new UserPoolIdentityProviderGoogle(this, "Google", {
            userPool,
            clientId: clientCredentials.secretValueFromJson("client_id").unsafeUnwrap(),
            clientSecret: clientCredentials.secretValueFromJson("client_secret").unsafeUnwrap(),

            // Email scope is required, otherwise we'll not get it
            scopes: ["email"],
            attributeMapping: {
                email: ProviderAttribute.GOOGLE_EMAIL,
            },
        });
        userPool.registerIdentityProvider(identityProviderGoogle);


        const userPoolClient = userPool.addClient('nest.js', {
            generateSecret: true,
            supportedIdentityProviders: [UserPoolClientIdentityProvider.GOOGLE],
            oAuth: {
                callbackUrls: [callbackUrl.toString()],
            },
        });
        // workaround for https://github.com/aws/aws-cdk/issues/15692
        userPoolClient.node.addDependency(identityProviderGoogle)

        const task = new FargateTaskDefinition(this, 'task', {
            runtimePlatform: {
                // fargate spot doesn't support ARM64 at the moment https://docs.aws.amazon.com/AmazonECS/latest/userguide/ecs-arm64.html
                // cpuArchitecture: CpuArchitecture.ARM64,
            }
        });

        const logGroup = new LogGroup(this, 'logs', {
            retention: RetentionDays.ONE_DAY
        });

        //  arn:aws:cloudformation:eu-central-1:814666749594:stack/CognitoGoogleAuthNestJs/96230dd0-981c-11ee-a821-02438dd8fe4b
        const backend = task.addContainer('backend', {
            image: ContainerImage.fromDockerImageAsset(new DockerImageAsset(this, 'backend-image', {
                directory: path.join(process.cwd(), '..', 'backend')
            })),
            environment: {
                PORT: '3000',
                OAUTH_CLIENT_ID: userPoolClient.userPoolClientId,
                OAUTH_CLIENT_SECRET: userPoolClient.userPoolClientSecret.unsafeUnwrap(),
                OAUTH_AUTHORIZATION_SERVER_URL: userPoolDomain.baseUrl(),
                OAUTH_CALLBACK_URL: callbackUrl.toString(),
                // if you want to use hosted page url then it can be generated with
                // OAUTH_SIGN_IN_URL: userPoolDomain.signInUrl(userPoolClient, { redirectUri: callbackUrl.toString() })
            },
            portMappings: [{ containerPort: 3000 }],
            logging: LogDriver.awsLogs({
                streamPrefix: "backend",
                logGroup: logGroup
            })
        });

        task.addContainer('caddy', {
            image: ContainerImage.fromRegistry('caddy:2-alpine'),
            command: [
                'caddy', 'reverse-proxy', '--from', baseNestJsUrl.hostname, '--to', '127.0.0.1:3000'
            ],
            portMappings: [{
                containerPort: 80
            }, {
                containerPort: 443
            }],
            logging: LogDriver.awsLogs({
                streamPrefix: "caddy",
                logGroup: logGroup
            }),
        }).addContainerDependencies({
            container: backend,
            condition: ContainerDependencyCondition.START
        })

        const cluster = new Cluster(this, 'cluster', {
            vpc
        });

        const service = new FargateService(this, 'backend-v3', {
            cluster: cluster,
            vpcSubnets: { subnetType: SubnetType.PUBLIC },
            taskDefinition: task,
            desiredCount: 1,
            capacityProviderStrategies: [{
                capacityProvider: 'FARGATE_SPOT',
                weight: 1,
                base: 1,
            }, {
                capacityProvider: 'FARGATE',
                weight: 1,
            }],
            assignPublicIp: true,
        });

        service.connections.allowFromAnyIpv4(Port.tcp(80), "Http")
        service.connections.allowFromAnyIpv4(Port.tcp(443), "Https")

        new PublicIPSupport(this, 'PublicIPSupport', {
            cluster,
            service,
            dnsConfig: {
                domainName: baseNestJsUrl.hostname,
                hostzedZone: hostedZone.hostedZoneId,
            },
        })
    }
}

//  arn:aws:ecs:eu-central-1:814666749594:cluster/CognitoGoogleAuthNestJs-cluster611F8AFF-jyXKJqLlHkZS
