import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateDemoDto } from './create-demo.dto';

@Controller('demo') // /demo
export class DemoController {
  @Post()
  create(@Body() dto: CreateDemoDto) {
    return { req: dto }
  }
}