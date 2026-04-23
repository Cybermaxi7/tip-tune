import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
} from '@nestjs/common';
import { GoalsService } from './goals.service';
import { GoalProgressService } from './goal-progress.service';
import { CreateGoalDto } from './dto/create-goal.dto';
import { UpdateGoalDto } from './dto/update-goal.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoalOwnerGuard } from './guards/goal-owner.guard';

@Controller('goals')
export class GoalsController {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly goalProgressService: GoalProgressService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Request() req, @Body() createGoalDto: CreateGoalDto) {
    return this.goalsService.create(createGoalDto, req.user.userId);
  }

  @Get('artist/:artistId')
  findAll(@Param('artistId') artistId: string) {
    return this.goalsService.findAllByArtist(artistId);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.goalsService.findOne(id);
  }

  @Get(':id/progress')
  getProgressStats(@Param('id') id: string) {
    return this.goalProgressService.getGoalProgressStats(id);
  }

  @Get(':id/progress-history')
  getProgressHistory(@Param('id') id: string) {
    return this.goalProgressService.getGoalProgressHistory(id);
  }

  @Get(':id/supporters')
  getSupporterActivity(@Param('id') id: string) {
    return this.goalProgressService.getSupporterActivitySummaries(id);
  }

  @Post(':id/snapshot')
  @UseGuards(JwtAuthGuard, GoalOwnerGuard)
  createManualSnapshot(@Param('id') id: string, @Request() req) {
    return this.goalProgressService.createManualSnapshot(id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, GoalOwnerGuard)
  update(
    @Param('id') id: string,
    @Body() updateGoalDto: UpdateGoalDto,
    @Request() req,
  ) {
    return this.goalsService.update(id, updateGoalDto, req.user.userId);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, GoalOwnerGuard)
  remove(@Param('id') id: string, @Request() req) {
    return this.goalsService.remove(id, req.user.userId);
  }
}
