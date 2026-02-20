import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { TermsService } from './terms.service';
import { CreateTermDto } from './dto/create-term.dto';
import { UpdateTermDto } from './dto/update-term.dto';

@Controller('terms')
export class TermsController {
  constructor(private readonly termsService: TermsService) {}

  @Post()
  create(@Body() createTermDto: CreateTermDto) {
    return this.termsService.create(createTermDto);
  }

  @Get()
  findAll() {
    return this.termsService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.termsService.findOne(+id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() updateTermDto: UpdateTermDto) {
    return this.termsService.update(+id, updateTermDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.termsService.remove(+id);
  }
}
