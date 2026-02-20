import { Test, TestingModule } from '@nestjs/testing';
import { TimeSlotsService } from './time-slots.service';

describe('TimeSlotsService', () => {
  let service: TimeSlotsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TimeSlotsService],
    }).compile();

    service = module.get<TimeSlotsService>(TimeSlotsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
