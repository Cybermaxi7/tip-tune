import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Artist } from './entities/artist.entity';
import { CreateArtistDto } from './dto/create-artist.dto';

@Injectable()
export class ArtistsService {
  private readonly logger = new Logger(ArtistsService.name);

  constructor(
    @InjectRepository(Artist)
    private artistsRepository: Repository<Artist>,
  ) {}

  async create(createArtistDto: CreateArtistDto): Promise<Artist> {
    try {
      const artist = this.artistsRepository.create(createArtistDto);
      const savedArtist = await this.artistsRepository.save(artist);
      this.logger.log(`Artist created successfully: ${savedArtist.id}`);
      return savedArtist;
    } catch (error) {
      this.logger.error(`Failed to create artist: ${error.message}`);
      throw error;
    }
  }

  async findAll(): Promise<Artist[]> {
    return this.artistsRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async findActive(): Promise<Artist[]> {
    return this.artistsRepository.find({
      where: { isActive: true },
      order: { name: 'ASC' },
    });
  }

  async findOne(id: string): Promise<Artist> {
    const artist = await this.artistsRepository.findOne({ 
      where: { id },
      relations: ['tracks'],
    });
    
    if (!artist) {
      throw new NotFoundException(`Artist with ID ${id} not found`);
    }
    
    return artist;
  }

  async update(id: string, updateArtistDto: Partial<CreateArtistDto>): Promise<Artist> {
    const artist = await this.findOne(id);
    
    Object.assign(artist, updateArtistDto);
    
    const updatedArtist = await this.artistsRepository.save(artist);
    this.logger.log(`Artist updated successfully: ${id}`);
    
    return updatedArtist;
  }

  async remove(id: string): Promise<void> {
    const artist = await this.findOne(id);
    
    await this.artistsRepository.remove(artist);
    this.logger.log(`Artist deleted successfully: ${id}`);
  }

  async search(query: string): Promise<Artist[]> {
    return this.artistsRepository
      .createQueryBuilder('artist')
      .where('artist.name ILIKE :query', { query: `%${query}%` })
      .orWhere('artist.bio ILIKE :query', { query: `%${query}%` })
      .orderBy('artist.name', 'ASC')
      .getMany();
  }

  async incrementPlayCount(id: string): Promise<Artist> {
    const artist = await this.findOne(id);
    
    artist.totalPlays += 1;
    
    const updatedArtist = await this.artistsRepository.save(artist);
    
    return updatedArtist;
  }

  async addTips(id: string, amount: number): Promise<Artist> {
    const artist = await this.findOne(id);
    
    artist.totalTips += amount;
    
    const updatedArtist = await this.artistsRepository.save(artist);
    
    return updatedArtist;
  }
}
