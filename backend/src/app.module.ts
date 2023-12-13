import { Module } from '@nestjs/common';
import { AppService } from './app.service';
import { ConfigModule } from "@nestjs/config";
import { AuthController, NestPassportOAuthStrategy } from './auth.controller';
import { PassportModule } from "@nestjs/passport";

@Module({
    imports: [
        ConfigModule.forRoot(),
        PassportModule
    ],
    controllers: [AuthController],
    providers: [AppService, NestPassportOAuthStrategy],
})
export class AppModule {
}
