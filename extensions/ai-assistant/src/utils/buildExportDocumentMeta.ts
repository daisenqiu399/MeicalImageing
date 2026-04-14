import { DicomMetadataStore, utils } from '@ohif/core';

const { formatDate, formatPN } = utils;

export type AIAssistantExportDocumentMeta = {
  institutionName: string;
  patientName: string;
  patientSex: string;
  patientAge: string;
  patientId: string;
  accessionNumber: string;
  studyDate: string;
  studyDescription: string;
  modality: string;
  seriesDescription: string;
};

type BuildExportDocumentMetaOptions = {
  studyInstanceUID?: string;
  viewportId?: string;
};

type UnknownRecord = Record<string, unknown>;

function toDisplayText(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }

  return String(value).trim();
}

function getViewportData(
  servicesManager: AppTypes.ServicesManager,
  viewportId?: string
): {
  activeViewportId: string | undefined;
  displaySets: UnknownRecord[];
} {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const activeViewportId = viewportId || viewportGridService.getActiveViewportId();
  const viewport = viewportGridService.getState()?.viewports?.get(activeViewportId);
  const displaySetInstanceUIDs = viewport?.displaySetInstanceUIDs || [];
  const displaySets = displaySetInstanceUIDs
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .filter(Boolean) as UnknownRecord[];

  return {
    activeViewportId,
    displaySets,
  };
}

function resolveStudyInstanceUID(
  servicesManager: AppTypes.ServicesManager,
  options: BuildExportDocumentMetaOptions,
  displaySets: UnknownRecord[]
) {
  if (options.studyInstanceUID) {
    return options.studyInstanceUID;
  }

  const viewportStudyUID = displaySets[0]?.StudyInstanceUID;

  if (typeof viewportStudyUID === 'string' && viewportStudyUID) {
    return viewportStudyUID;
  }

  return DicomMetadataStore.getStudyInstanceUIDs()[0];
}

function getPrimaryInstance(displaySet?: UnknownRecord): UnknownRecord | undefined {
  if (!displaySet) {
    return undefined;
  }

  const instances = displaySet.instances;
  if (Array.isArray(instances) && instances.length) {
    return instances[0] as UnknownRecord;
  }

  return (displaySet.instance as UnknownRecord | undefined) || undefined;
}

function formatPatientName(value: unknown) {
  const formatted = formatPN(value);
  return typeof formatted === 'string' ? formatted.trim() : '';
}

function formatStudyDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) {
    return '';
  }

  const formatted = formatDate(value);
  return typeof formatted === 'string' ? formatted.trim() : '';
}

export default function buildExportDocumentMeta(
  servicesManager: AppTypes.ServicesManager,
  options: BuildExportDocumentMetaOptions = {}
): AIAssistantExportDocumentMeta {
  const { displaySets } = getViewportData(servicesManager, options.viewportId);
  const primaryDisplaySet = displaySets[0];
  const primaryInstance = getPrimaryInstance(primaryDisplaySet);
  const studyInstanceUID = resolveStudyInstanceUID(servicesManager, options, displaySets);
  const study = studyInstanceUID ? (DicomMetadataStore.getStudy(studyInstanceUID) as UnknownRecord) : undefined;
  const modalitiesInStudy = Array.isArray(study?.ModalitiesInStudy)
    ? (study?.ModalitiesInStudy as unknown[])
        .map(item => toDisplayText(item))
        .filter(Boolean)
    : [];

  return {
    institutionName: toDisplayText(primaryInstance?.InstitutionName || study?.InstitutionName),
    patientName: formatPatientName(primaryInstance?.PatientName || study?.PatientName),
    patientSex: toDisplayText(primaryInstance?.PatientSex || study?.PatientSex),
    patientAge: toDisplayText(primaryInstance?.PatientAge || study?.PatientAge),
    patientId: toDisplayText(
      primaryInstance?.PatientID ||
        primaryInstance?.PatientId ||
        study?.PatientID ||
        study?.PatientId
    ),
    accessionNumber: toDisplayText(
      primaryInstance?.AccessionNumber || study?.AccessionNumber
    ),
    studyDate: formatStudyDate(primaryInstance?.StudyDate || study?.StudyDate),
    studyDescription: toDisplayText(
      primaryInstance?.StudyDescription ||
        primaryDisplaySet?.StudyDescription ||
        study?.StudyDescription
    ),
    modality: toDisplayText(
      primaryDisplaySet?.Modality || primaryInstance?.Modality || modalitiesInStudy.join('/')
    ),
    seriesDescription: toDisplayText(
      primaryDisplaySet?.SeriesDescription ||
        primaryDisplaySet?.displaySetLabel ||
        primaryInstance?.SeriesDescription
    ),
  };
}
