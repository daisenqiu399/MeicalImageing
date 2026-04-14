import { id as extensionId } from './id';

const aiAssistantPanelId = `${extensionId}.panelModule.aiAssistant`;

function getCommandsModule({ servicesManager }) {
  const { aiAssistantService, panelService } = servicesManager.services;

  const actions = {
    openAiAssistantPanel: () => {
      panelService.activatePanel(aiAssistantPanelId, true);
    },
    captureAiViewport: async options => {
      return aiAssistantService.captureActiveViewport(options);
    },
    sendAiChatMessage: async options => {
      return aiAssistantService.sendChatMessage(
        options?.message || options?.content || '',
        options
      );
    },
    generateAiReportDraft: async options => {
      return aiAssistantService.generateReportDraft(options);
    },
    exportAiReportPdf: async () => {
      return aiAssistantService.exportPdf();
    },
    clearAiDraft: () => {
      aiAssistantService.clearDraft();
    },
  };

  const definitions = {
    openAiAssistantPanel: actions.openAiAssistantPanel,
    captureAiViewport: actions.captureAiViewport,
    sendAiChatMessage: actions.sendAiChatMessage,
    generateAiReportDraft: actions.generateAiReportDraft,
    exportAiReportPdf: actions.exportAiReportPdf,
    clearAiDraft: actions.clearAiDraft,
  };

  return {
    actions,
    definitions,
    defaultContext: 'DEFAULT',
  };
}

export default getCommandsModule;
