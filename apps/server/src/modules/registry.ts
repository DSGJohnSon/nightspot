import type { ModuleId } from '@nightspot/shared';
import { guessTheClip } from './guess-the-clip';
import type { GameModule } from './types';

type AnyModule = GameModule<any, any>;

const modules: Record<ModuleId, AnyModule> = {
  'guess-the-clip': guessTheClip,
};

export function getModule(id: ModuleId): AnyModule {
  return modules[id];
}
