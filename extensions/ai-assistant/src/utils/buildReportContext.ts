import { DicomMetadataStore } from '@ohif/core';

type BuildReportContextOptions = {
  studyInstanceUID?: string;
  viewportId?: string;
  locale?: string;
};

type UnknownRecord = Record<string, unknown>;

const PHI_FIELDS = new Set([
  'PatientName',
  'PatientID',
  'PatientId',
  'PatientBirthDate',
  'PatientAge',
  'PatientSex',
  'PatientWeight',
  'PatientAddress',
  'OtherPatientIDs',
  'OtherPatientNames',
  'IssuerOfPatientID',
  'InstitutionName',
  'InstitutionAddress',
  'ReferringPhysicianName',
  'PerformingPhysicianName',
  'OperatorsName',
  'AccessionNumber',
]);

const STUDY_FIELDS = ['StudyInstanceUID', 'StudyDescription', 'StudyDate', 'ModalitiesInStudy'];
const SERIES_FIELDS = [
  'SeriesInstanceUID',
  'SeriesNumber',
  'SeriesDescription',
  'Modality',
  'BodyPartExamined',
  'Laterality',
  'SliceThickness',
];
const DISPLAY_SET_FIELDS = [
  'displaySetInstanceUID',
  'StudyInstanceUID',
  'SeriesInstanceUID',
  'SeriesNumber',
  'SeriesDescription',
  'Modality',
  'displaySetLabel',
];
const MEASUREMENT_FIELDS = [
  'uid',
  'label',
  'description',
  'type',
  'unit',
  'toolName',
  'referenceStudyUID',
  'referenceSeriesUID',
  'displaySetInstanceUID',
  'SOPInstanceUID',
  'FrameOfReferenceUID',
  'frameNumber',
  'isLocked',
  'isVisible',
  'area',
  'mean',
  'stdDev',
  'perimeter',
  'length',
  'shortestDiameter',
  'longestDiameter',
];

function pickFields(source: UnknownRecord | undefined, fields: string[]) {
  return fields.reduce((result, field) => {
    const value = source?.[field];
    if (value !== undefined && typeof value !== 'function') {
      result[field] = value;
    }
    return result;
  }, {} as UnknownRecord);
}

function compactObject<T extends UnknownRecord>(input: T): T {
  return Object.entries(input).reduce((result, [key, value]) => {
    if (value === undefined || value === null) {
      return result;
    }

    if (Array.isArray(value)) {
      const filteredArray = value
        .map(item => {
          if (item && typeof item === 'object') {
            return compactObject(item as UnknownRecord);
          }

          return item;
        })
        .filter(item => item !== undefined && item !== null);

      if (filteredArray.length) {
        result[key] = filteredArray;
      }
      return result;
    }

    if (value && typeof value === 'object') {
      const nestedObject = compactObject(value as UnknownRecord);
      if (Object.keys(nestedObject).length) {
        result[key] = nestedObject;
      }
      return result;
    }

    result[key] = value;
    return result;
  }, {} as T);
}

function toSafeNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function flattenDisplayText(displayText: unknown): string[] {
  if (!displayText || typeof displayText !== 'object') {
    return [];
  }

  const { primary = [], secondary = [] } = displayText as {
    primary?: unknown[];
    secondary?: unknown[];
  };

  return [...primary, ...secondary].filter(item => typeof item === 'string') as string[];
}

function serializeDisplaySet(displaySet) {
  if (!displaySet) {
    return undefined;
  }

  return compactObject({
    ...pickFields(displaySet, DISPLAY_SET_FIELDS),
    numInstances: Array.isArray(displaySet.instances) ? displaySet.instances.length : undefined,
    numImageFrames: toSafeNumber(displaySet.numImageFrames),
  });
}

function serializeSeries(series) {
  if (!series) {
    return undefined;
  }

  return compactObject({
    ...pickFields(series, SERIES_FIELDS),
    numInstances: Array.isArray(series.instances) ? series.instances.length : undefined,
  });
}

function serializeStudy(study, fallbackStudyInstanceUID?: string) {
  if (!study) {
    return compactObject({
      StudyInstanceUID: fallbackStudyInstanceUID,
      numberOfSeries: 0,
      series: [],
    });
  }

  const series = Array.isArray(study.series)
    ? study.series.map(item => serializeSeries(item)).filter(Boolean)
    : [];

  return compactObject({
    ...pickFields(study, STUDY_FIELDS),
    numberOfSeries: series.length,
    series,
  });
}

function serializeMeasurement(measurement) {
  if (!measurement) {
    return undefined;
  }

  const finding =
    measurement.finding && typeof measurement.finding === 'object'
      ? measurement.finding.text
      : undefined;
  const findingSites = Array.isArray(measurement.findingSites)
    ? measurement.findingSites
        .map(site => (site && typeof site === 'object' ? site.text : undefined))
        .filter(Boolean)
    : [];

  return compactObject({
    ...pickFields(measurement, MEASUREMENT_FIELDS),
    displayText: flattenDisplayText(measurement.displayText),
    finding,
    findingSites,
    pointCount: Array.isArray(measurement.points) ? measurement.points.length : undefined,
    cachedStats:
      measurement.cachedStats && typeof measurement.cachedStats === 'object'
        ? compactObject(
            Object.entries(measurement.cachedStats as UnknownRecord).reduce(
              (result, [key, value]) => {
                if (typeof value === 'number' && Number.isFinite(value)) {
                  result[key] = value;
                }
                return result;
              },
              {} as UnknownRecord
            )
          )
        : undefined,
  });
}

export function redactPhi<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map(item => redactPhi(item)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.entries(value as UnknownRecord).reduce((result, [key, entryValue]) => {
    if (PHI_FIELDS.has(key)) {
      return result;
    }

    result[key] = redactPhi(entryValue);
    return result;
  }, {} as UnknownRecord) as T;
}

function getViewportData(servicesManager, viewportId?: string) {
  const { viewportGridService, displaySetService } = servicesManager.services;
  const activeViewportId = viewportId || viewportGridService.getActiveViewportId();
  const state = viewportGridService.getState();
  const viewport = state?.viewports?.get(activeViewportId);
  const displaySetInstanceUIDs = viewport?.displaySetInstanceUIDs || [];
  const displaySets = displaySetInstanceUIDs
    .map(uid => displaySetService.getDisplaySetByUID(uid))
    .filter(Boolean)
    .map(serializeDisplaySet);

  return {
    activeViewportId,
    viewport,
    displaySetInstanceUIDs,
    displaySets,
  };
}

function resolveStudyInstanceUID(servicesManager, options: BuildReportContextOptions) {
  if (options.studyInstanceUID) {
    return options.studyInstanceUID;
  }

  const { displaySets } = getViewportData(servicesManager, options.viewportId);
  const viewportStudyUID = displaySets[0]?.StudyInstanceUID;

  if (viewportStudyUID) {
    return viewportStudyUID;
  }

  const studyInstanceUIDs = DicomMetadataStore.getStudyInstanceUIDs();

  return studyInstanceUIDs[0];
}

export function buildReportContext(
  servicesManager,
  options: BuildReportContextOptions = {}
): UnknownRecord {
  const { measurementService } = servicesManager.services;
  const { activeViewportId, viewport, displaySetInstanceUIDs, displaySets } = getViewportData(
    servicesManager,
    options.viewportId
  );
  const studyInstanceUID = resolveStudyInstanceUID(servicesManager, options);

  if (!studyInstanceUID) {
    throw new Error('No active study is available for AI report drafting.');
  }

  const study = DicomMetadataStore.getStudy(studyInstanceUID);
  const activeSeriesUIDs = new Set(
    displaySets.map(displaySet => displaySet?.SeriesInstanceUID).filter(Boolean)
  );

  const measurements = measurementService
    .getMeasurements(measurement => {
      if (measurement.referenceStudyUID === studyInstanceUID) {
        return true;
      }

      if (measurement.displaySetInstanceUID && displaySetInstanceUIDs.includes(measurement.displaySetInstanceUID)) {
        return true;
      }

      if (measurement.referenceSeriesUID && activeSeriesUIDs.has(measurement.referenceSeriesUID)) {
        return true;
      }

      return false;
    })
    .map(measurement => serializeMeasurement(measurement))
    .filter(Boolean);

  const payload = compactObject({
    contextVersion: 'v1',
    locale: options.locale || 'zh-CN',
    studyContext: serializeStudy(study, studyInstanceUID),
    activeViewport: {
      viewportId: activeViewportId,
      positionId: viewport?.positionId,
      displaySetInstanceUIDs,
      displaySets,
    },
    measurements,
  });

  return redactPhi(payload);
}

export default buildReportContext;
