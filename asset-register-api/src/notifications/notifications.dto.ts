import { IsBoolean, IsIn } from 'class-validator';

export const NOTIFICATION_CATEGORIES=['verification','transfers','repairs','data_quality','missing'] as const;
export type NotificationCategory=typeof NOTIFICATION_CATEGORIES[number];

export class UpdateNotificationPreferenceDto {
  @IsIn(NOTIFICATION_CATEGORIES) category!:NotificationCategory;
  @IsBoolean() inAppEnabled!:boolean;
}
