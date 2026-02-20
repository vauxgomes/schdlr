import { Injectable } from '@nestjs/common';
import { CreateTimeSlotDto } from './dto/create-time-slot.dto';
import { UpdateTimeSlotDto } from './dto/update-time-slot.dto';

@Injectable()
export class TimeSlotsService {
  create(createTimeSlotDto: CreateTimeSlotDto) {
    return 'This action adds a new timeSlot';
  }

  findAll() {
    return `This action returns all timeSlots`;
  }

  findOne(id: number) {
    return `This action returns a #${id} timeSlot`;
  }

  update(id: number, updateTimeSlotDto: UpdateTimeSlotDto) {
    return `This action updates a #${id} timeSlot`;
  }

  remove(id: number) {
    return `This action removes a #${id} timeSlot`;
  }
}
