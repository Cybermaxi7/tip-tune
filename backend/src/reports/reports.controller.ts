import { Controller, Get, Post, Body, Patch, Param, UseGuards, Query, BadRequestException } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { AssignReportDto } from './dto/assign-report.dto';
import { ReportQueryDto } from './dto/report-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, User } from '../users/entities/user.entity';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Post()
  create(@Body() createReportDto: CreateReportDto, @CurrentUser() user: User) {
    return this.reportsService.create(createReportDto, user);
  }

  @Get()
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  async findAll(@Query() query: any) {
    const dto = plainToInstance(ReportQueryDto, query);
    const errors = await validate(dto);
    if (errors.length > 0) {
      throw new BadRequestException('Invalid query parameters');
    }
    return this.reportsService.findAll(dto);
  }

  @Get(':id')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  @Patch(':id/status')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  updateStatus(
    @Param('id') id: string,
    @Body() updateDto: UpdateReportStatusDto,
    @CurrentUser() admin: User,
  ) {
    return this.reportsService.updateStatus(id, updateDto, admin);
  }

  @Patch(':id/assign')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  assign(
    @Param('id') id: string,
    @Body() assignDto: AssignReportDto,
    @CurrentUser() admin: User,
  ) {
    return this.reportsService.assignReport(id, assignDto.assigneeId, admin);
  }

  @Patch(':id/escalate')
  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  escalate(
    @Param('id') id: string,
    @CurrentUser() admin: User,
  ) {
    return this.reportsService.escalateReport(id, admin);
  }
}
