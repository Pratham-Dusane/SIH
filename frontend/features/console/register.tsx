// Core Query Console — Right Rail Panel Registration
import { registerPanel, ALL_SCENE_TYPES } from '@/lib/registry';
import QueryConsole from '@/components/query/QueryConsole';

registerPanel({
  id: 'console',
  featureId: 'console',
  label: 'Query Console',
  icon: 'terminal',
  order: 50,
  availableFor: ALL_SCENE_TYPES,
  Component: QueryConsole,
});
