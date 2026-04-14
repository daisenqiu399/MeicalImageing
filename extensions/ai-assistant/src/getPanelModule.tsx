import React from 'react';
import AIAssistantPanel from './panels/AIAssistantPanel';

function getPanelModule() {
  return [
    {
      name: 'aiAssistant',
      iconName: 'tab-linear',
      iconLabel: 'AI',
      label: 'AI 诊断',
      component: props => <AIAssistantPanel {...props} />,
    },
  ];
}

export default getPanelModule;
