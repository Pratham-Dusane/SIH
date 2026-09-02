// F5 Historical Scenes — Left Nav Registration (Extensions PRD §8)
import { registerNavItem } from '@/lib/registry';

registerNavItem({
  id: 'historical',
  featureId: 'historical',
  label: 'Historical Scenes',
  icon: 'clock',
  order: 250,
  href: '/historical',
});
