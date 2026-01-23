import { Injectable } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway';

@Injectable()
export class NotificationsService {
  constructor(private readonly notificationsGateway: NotificationsGateway) {}

  notifyArtistOfTip(artistId: string, tip: any) {
    this.notificationsGateway.sendNotificationToArtist(artistId, {
      type: 'TIP_RECEIVED',
      data: tip,
      timestamp: new Date(),
    });
    
    // Also notify the user as "artist" if they are connected as a user?
    // The gateway handles `artist:${artistId}` room.
    // We can also notify the specific user ID of the artist.
    this.notificationsGateway.sendNotificationToUser(artistId, {
       type: 'TIP_RECEIVED',
       data: tip,
       timestamp: new Date(),
    });
  }

  notifyUser(userId: string, notification: any) {
    this.notificationsGateway.sendNotificationToUser(userId, notification);
  }
}
