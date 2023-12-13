import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import * as path from "path";
import * as process from "process";

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule);
    app.setBaseViewsDir(path.join(process.cwd(), 'views'))
    app.setViewEngine('hbs')
    await app.listen(process.env.PORT || 3000);
}

bootstrap();
