import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  create(createAppDto: unknown) {
    return 'This action adds a new app';
  }

  findAll() {
    // 测试环境变量是否加载成功
    return 'This action returns all app, FOO: ' + process.env.FOO;
  }

  findOne(id: number) {
    return `This action returns a #${id} app`;
  }

  update(id: number, updateAppDto: unknown) {
    return `This action updates a #${id} app`;
  }

  remove(id: number) {
    return `This action removes a #${id} app`;
  }
}
