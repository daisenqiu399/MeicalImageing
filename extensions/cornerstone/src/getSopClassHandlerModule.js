import OHIF from '@ohif/core';
import { utilities as csUtils, Enums as csEnums } from '@cornerstonejs/core';
import { buildEcgModule } from './utils/ecgMetadata';

const { MetadataModules } = csEnums;
const { utils } = OHIF;

/**
 * DICOM Waveform SOP Class UIDs for ECG / cardiac electrophysiology.
 * Reference: https://dicom.nema.org/medical/dicom/current/output/chtml/part04/sect_B.5.html
 */
const ECG_SOP_CLASS_UIDS = {
  TWELVE_LEAD_ECG_WAVEFORM_STORAGE: '1.2.840.10008.5.1.4.1.1.9.1.1',
  GENERAL_ECG_WAVEFORM_STORAGE: '1.2.840.10008.5.1.4.1.1.9.1.2',
  AMBULATORY_ECG_WAVEFORM_STORAGE: '1.2.840.10008.5.1.4.1.1.9.1.3',
  HEMODYNAMIC_WAVEFORM_STORAGE: '1.2.840.10008.5.1.4.1.1.9.2.1',
  CARDIAC_ELECTROPHYSIOLOGY_WAVEFORM_STORAGE: '1.2.840.10008.5.1.4.1.1.9.3.1',
};

const ecgSopClassUids = Object.values(ECG_SOP_CLASS_UIDS);

const DicomEcgSOPClassHandlerId =
  '@ohif/extension-cornerstone.sopClassHandlerModule.DicomEcgSopClassHandler';

function _getEcgDisplaySetsFromSeries(instances, servicesManager) {
  const { userAuthenticationService } = servicesManager.services;

  return instances.map(instance => {
    const { Modality, SOPInstanceUID } = instance;
    const { SeriesDescription, SeriesNumber, SeriesDate } = instance;
    const { SeriesInstanceUID, StudyInstanceUID, SOPClassUID } = instance;
    const imageId = instance.imageId;

    if (imageId) {
      const ecgModule = buildEcgModule(instance, userAuthenticationService);
      if (ecgModule) {
        csUtils.genericMetadataProvider.addRaw(imageId, {
          type: MetadataModules.ECG,
          metadata: ecgModule,
        });
      }
    }

    return {
      Modality,
      displaySetInstanceUID: utils.guid(),
      SeriesDescription,
      SeriesNumber,
      SeriesDate,
      SOPInstanceUID,
      SeriesInstanceUID,
      StudyInstanceUID,
      SOPClassHandlerId: DicomEcgSOPClassHandlerId,
      SOPClassUID,
      referencedImages: null,
      measurements: null,
      viewportType: csEnums.ViewportType.ECG,
      instances: [instance],
      instance,
      thumbnailSrc: null,
      isDerivedDisplaySet: false,
      isLoaded: false,
      sopClassUids: ecgSopClassUids,
      numImageFrames: 0,
      numInstances: 1,
      imageIds: imageId ? [imageId] : [],
      supportsWindowLevel: false,
      label: SeriesDescription || 'ECG',
    };
  });
}

export function getDicomEcgSopClassHandler({ servicesManager }) {
  const getDisplaySetsFromSeries = instances =>
    _getEcgDisplaySetsFromSeries(instances, servicesManager);

  return {
    name: 'DicomEcgSopClassHandler',
    sopClassUids: ecgSopClassUids,
    getDisplaySetsFromSeries,
  };
}

export function getSopClassHandlerModule(params) {
  return [getDicomEcgSopClassHandler(params)];
}
