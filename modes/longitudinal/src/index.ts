import i18n from 'i18next';
import { ToolbarService } from '@ohif/core';
import { id } from './id';
import {
  initToolGroups,
  toolbarButtons,
  aiAssistant,
  cornerstone,
  ohif,
  dicomsr,
  dicomvideo,
  basicLayout,
  basicRoute,
  extensionDependencies as basicDependencies,
  mode as basicMode,
  modeInstance as basicModeInstance,
} from '@ohif/mode-basic';

const { TOOLBAR_SECTIONS } = ToolbarService;

export const tracked = {
  measurements: '@ohif/extension-measurement-tracking.panelModule.trackedMeasurements',
  thumbnailList: '@ohif/extension-measurement-tracking.panelModule.seriesList',
  viewport: '@ohif/extension-measurement-tracking.viewportModule.cornerstone-tracked',
};

const ensureUniqueItem = <T>(items: T[], item: T) => {
  return items.includes(item) ? items : [...items, item];
};

const longitudinalRightPanels = ensureUniqueItem(
  [cornerstone.segmentation, tracked.measurements],
  aiAssistant.panel
);

const longitudinalToolbarSections = {
  ...basicModeInstance.toolbarSections,
  [TOOLBAR_SECTIONS.primary]: ensureUniqueItem(
    basicModeInstance.toolbarSections?.[TOOLBAR_SECTIONS.primary] || [],
    'AIDiagnosis'
  ),
};

export const extensionDependencies = {
  // Can derive the versions at least process.env.from npm_package_version
  ...basicDependencies,
  '@ohif/extension-measurement-tracking': '^3.0.0',
};

export const longitudinalInstance = {
  ...basicLayout,
  id: ohif.layout,
  props: {
    ...basicLayout.props,
    leftPanels: [tracked.thumbnailList],
    rightPanels: longitudinalRightPanels,
    viewports: [
      {
        namespace: tracked.viewport,
        // Re-use the display sets from basic
        displaySetsToDisplay: basicLayout.props.viewports[0].displaySetsToDisplay,
      },
      ...basicLayout.props.viewports,
    ],
  },
};

export const longitudinalRoute = {
  ...basicRoute,
  path: 'longitudinal',
  /*init: ({ servicesManager, extensionManager }) => {
          //defaultViewerRouteInit
        },*/
  layoutInstance: longitudinalInstance,
};

export const modeInstance = {
  ...basicModeInstance,
  // TODO: We're using this as a route segment
  // We should not be.
  id,
  routeName: 'viewer',
  displayName: i18n.t('Modes:Basic Viewer'),
  toolbarButtons,
  toolbarSections: longitudinalToolbarSections,
  routes: [longitudinalRoute],
  extensions: extensionDependencies,
};

const mode = {
  ...basicMode,
  id,
  modeInstance,
  extensionDependencies,
};

export default mode;
export { initToolGroups, toolbarButtons };
