import { Controller, Get, Injectable, Query, Render, Req, UseGuards } from '@nestjs/common';
import { ConfigService } from "@nestjs/config";
import { AuthGuard, PassportStrategy } from "@nestjs/passport";
import OAuth2Strategy from "passport-oauth2";


interface OAuthClientEnvConfiguration {
    OAUTH_CLIENT_ID: string
    OAUTH_CLIENT_SECRET: string
    OAUTH_AUTHORIZATION_SERVER_URL: string
    OAUTH_CALLBACK_URL: string
}

@Controller()
export class AuthController {
    constructor(private readonly configService: ConfigService<OAuthClientEnvConfiguration>) {
    }

    @Get()
    @Render("login")
    loginView() {
        const baseAuthUrl = this.configService.getOrThrow('OAUTH_AUTHORIZATION_SERVER_URL');
        const clientId = this.configService.getOrThrow('OAUTH_CLIENT_ID')
        const loginViaGoogleUrl = `${baseAuthUrl}/oauth2/authorize?${new URLSearchParams(Object.entries({
                client_id: clientId,
                identity_provider: "Google",
                response_type: "code",
                redirect_uri: this.configService.getOrThrow('OAUTH_CALLBACK_URL'),
            }))}`
    }

    // @Get("/auth/callback")
    async signIn(@Query('code') authorizationCode: string) {
        const clientId = this.configService.getOrThrow('OAUTH_CLIENT_ID')
        const clientSecret = this.configService.getOrThrow('OAUTH_CLIENT_SECRET')
        const authorizationEncoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

        const authParams = new URLSearchParams(Object.entries({
            client_id: clientId,
            code: authorizationCode,
            grant_type: "authorization_code",
            redirect_uri: this.configService.getOrThrow('OAUTH_CALLBACK_URL'),
        }));

        const tokenUrl = `${this.configService.getOrThrow('OAUTH_AUTHORIZATION_SERVER_URL')}/oauth2/token?` + authParams;

        const tokenData = await (await fetch(tokenUrl, {
            method: 'POST',
            headers: {
                Authorization: `Basic ${authorizationEncoded}`,
                "Content-Type": "application/x-www-form-urlencoded",
            },
        })).json();

        console.log(tokenData)
    }

    @UseGuards(AuthGuard('oauth'))
    @Get("/auth/callback")
    async signInPassport(@Req() req: Express.AuthenticatedRequest) {
        console.log(req.user)
    }

}

@Injectable()
export class NestPassportOAuthStrategy extends PassportStrategy(OAuth2Strategy) {
    constructor(configService: ConfigService<OAuthClientEnvConfiguration>) {
        super({
            clientID: configService.getOrThrow('OAUTH_CLIENT_ID'),
            clientSecret: configService.getOrThrow('OAUTH_CLIENT_SECRET'),
            authorizationURL: `${configService.getOrThrow('OAUTH_AUTHORIZATION_SERVER_URL')}/oauth2/authorize`,
            tokenURL: `${configService.getOrThrow('OAUTH_AUTHORIZATION_SERVER_URL')}/oauth2/token`,
            callbackURL: configService.getOrThrow('OAUTH_CALLBACK_URL')
        } as OAuth2Strategy.StrategyOptions, (accessToken, refreshToken, results, profile, verified) => {
            console.log('verified', { accessToken, refreshToken, results, profile, verified })
        });
    }
}

