import { Types } from '@ohif/core';
import getPanelModule from './getPanelModule';
import getCommandsModule from './getCommandsModule';
import { AIAssistantService } from './services';
import { id } from './id';
import './types';

const aiAssistantExtension: Types.Extensions.Extension = {
  id,

  preRegistration({ servicesManager, configuration }) {
    servicesManager.registerService(AIAssistantService.REGISTRATION, configuration);
  },

  getPanelModule,
  getCommandsModule,
};

export default aiAssistantExtension;
export { AIAssistantService };
