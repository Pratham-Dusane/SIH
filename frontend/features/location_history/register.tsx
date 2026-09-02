// F12 Location History & Context Research — Panel Registration
import { registerPanel, ALL_SCENE_TYPES } from '@/lib/registry';
import LocationHistoryPanel from './LocationHistoryPanel';

registerPanel({
  id: 'location_history',
  featureId: 'location_history',
  label: 'Location Context',
  icon: 'book_open',
  order: 350,
  availableFor: ALL_SCENE_TYPES,
  Component: LocationHistoryPanel,
});
