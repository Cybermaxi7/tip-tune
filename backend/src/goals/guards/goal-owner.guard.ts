import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { GoalsService } from '../goals.service';
import { ArtistsService } from '../../artists/artists.service';

@Injectable()
export class GoalOwnerGuard implements CanActivate {
  constructor(
    private readonly goalsService: GoalsService,
    private readonly artistsService: ArtistsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.userId;
    const goalId = request.params.id;

    if (!userId) {
      throw new ForbiddenException('User not authenticated');
    }

    if (!goalId) {
      return true; // No goal ID to check, let it pass (maybe create or list)
    }

    try {
      // Find the goal
      const goal = await this.goalsService.findOne(goalId);
      
      // Find the artist profile for the current user
      const artist = await this.artistsService.findByUser(userId);

      // Check if the goal belongs to the artist
      if (goal.artistId !== artist.id) {
        throw new ForbiddenException('You do not have permission to modify this goal');
      }

      return true;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      if (error instanceof ForbiddenException) {
        throw error;
      }
      // For any other error (like artist profile not found)
      throw new ForbiddenException('You must have an artist profile to modify goals');
    }
  }
}
