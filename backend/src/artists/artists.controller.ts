import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { ArtistsService } from './artists.service';
import { CreateArtistDto } from './dto/create-artist.dto';
import { Artist } from './entities/artist.entity';

@ApiTags('artists')
@Controller('artists')
export class ArtistsController {
  constructor(private readonly artistsService: ArtistsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new artist' })
  @ApiResponse({ status: 201, description: 'Artist created successfully', type: Artist })
  @ApiResponse({ status: 400, description: 'Bad Request - Invalid data' })
  create(@Body() createArtistDto: CreateArtistDto): Promise<Artist> {
    return this.artistsService.create(createArtistDto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all artists' })
  @ApiResponse({ status: 200, description: 'List of all artists', type: [Artist] })
  findAll(): Promise<Artist[]> {
    return this.artistsService.findAll();
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active artists' })
  @ApiResponse({ status: 200, description: 'List of active artists', type: [Artist] })
  findActive(): Promise<Artist[]> {
    return this.artistsService.findActive();
  }

  @Get('search')
  @ApiOperation({ summary: 'Search artists by name or bio' })
  @ApiQuery({ name: 'q', description: 'Search query', required: true })
  @ApiResponse({ status: 200, description: 'Search results', type: [Artist] })
  search(@Query('q') query: string): Promise<Artist[]> {
    if (!query) {
      throw new BadRequestException('Search query is required');
    }
    return this.artistsService.search(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get an artist by ID' })
  @ApiResponse({ status: 200, description: 'Artist details', type: Artist })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  findOne(@Param('id', ParseUUIDPipe) id: string): Promise<Artist> {
    return this.artistsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an artist' })
  @ApiResponse({ status: 200, description: 'Artist updated successfully', type: Artist })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateArtistDto: Partial<CreateArtistDto>,
  ): Promise<Artist> {
    return this.artistsService.update(id, updateArtistDto);
  }

  @Patch(':id/play')
  @ApiOperation({ summary: 'Increment artist play count' })
  @ApiResponse({ status: 200, description: 'Play count incremented', type: Artist })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  incrementPlayCount(@Param('id', ParseUUIDPipe) id: string): Promise<Artist> {
    return this.artistsService.incrementPlayCount(id);
  }

  @Patch(':id/tips')
  @ApiOperation({ summary: 'Add tips to artist total' })
  @ApiResponse({ status: 200, description: 'Tips added successfully', type: Artist })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  addTips(
    @Param('id', ParseUUIDPipe) id: string,
    @Body('amount') amount: number,
  ): Promise<Artist> {
    if (!amount || amount <= 0) {
      throw new BadRequestException('Valid tip amount is required');
    }
    return this.artistsService.addTips(id, amount);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an artist' })
  @ApiResponse({ status: 200, description: 'Artist deleted successfully' })
  @ApiResponse({ status: 404, description: 'Artist not found' })
  remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    return this.artistsService.remove(id);
  }
}
