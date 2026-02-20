import { Test, TestingModule } from '@nestjs/testing';
import { CurriculumsController } from './curriculums.controller';
import { CurriculumsService } from './curriculums.service';

describe('CurriculumsController', () => {
  let controller: CurriculumsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [CurriculumsController],
      providers: [CurriculumsService],
    }).compile();

    controller = module.get<CurriculumsController>(CurriculumsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
