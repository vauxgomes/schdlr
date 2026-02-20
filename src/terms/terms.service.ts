import { Injectable } from '@nestjs/common';
import { CreateTermDto } from './dto/create-term.dto';
import { UpdateTermDto } from './dto/update-term.dto';

@Injectable()
export class TermsService {
  create(createTermDto: CreateTermDto) {
    return 'This action adds a new term';
  }

  findAll() {
    return `This action returns all terms`;
  }

  findOne(id: number) {
    return `This action returns a #${id} term`;
  }

  update(id: number, updateTermDto: UpdateTermDto) {
    return `This action updates a #${id} term`;
  }

  remove(id: number) {
    return `This action removes a #${id} term`;
  }
}
