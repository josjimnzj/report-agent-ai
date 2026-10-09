import { createSafeStorage } from '@/shared/persist';
import { $notify } from '@/shared/notify';

export const safeStorage = createSafeStorage(() =>
  $notify.warning('El almacenamiento local está lleno. Elimina chats o reportes antiguos para seguir guardando.'));
