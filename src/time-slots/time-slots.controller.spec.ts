import { Test, TestingModule } from '@nestjs/testing';
import { TimeSlotsController } from './time-slots.controller';
import { TimeSlotsService } from './time-slots.service';

describe('TimeSlotsController', () => {
  let controller: TimeSlotsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TimeSlotsController],
      providers: [TimeSlotsService],
    }).compile();

    controller = module.get<TimeSlotsController>(TimeSlotsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
