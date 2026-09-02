// F1 Enhancement — Panel Registration (Extensions PRD §4)
import { registerPanel, ALL_SCENE_TYPES } from '@/lib/registry';
import EnhancementPanel from './EnhancementPanel';

registerPanel({
  id: 'enhancement',
  featureId: 'enhancement',
  label: 'Enhancement',
  icon: 'sparkles',
  order: 100,
  availableFor: ALL_SCENE_TYPES,
  Component: EnhancementPanel,
});
