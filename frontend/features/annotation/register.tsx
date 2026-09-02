// F2 Layered Annotation — Panel Registration (Extensions PRD §5)
import { registerPanel, ALL_SCENE_TYPES } from '@/lib/registry';
import AnnotationPanel from './AnnotationPanel';

registerPanel({
  id: 'annotation',
  featureId: 'annotation',
  label: 'Annotations',
  icon: 'pen_tool',
  order: 200,
  availableFor: ALL_SCENE_TYPES,
  Component: AnnotationPanel,
});
