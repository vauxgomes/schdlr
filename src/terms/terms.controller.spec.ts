import { Test, TestingModule } from '@nestjs/testing';
import { TermsController } from './terms.controller';
import { TermsService } from './terms.service';

describe('TermsController', () => {
  let controller: TermsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TermsController],
      providers: [TermsService],
    }).compile();

    controller = module.get<TermsController>(TermsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
