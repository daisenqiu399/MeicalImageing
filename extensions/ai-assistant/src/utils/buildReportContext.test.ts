import { DicomMetadataStore } from '@ohif/core';
import buildReportContext, { redactPhi } from './buildReportContext';

describe('buildReportContext', () => {
  const displaySet = {
    displaySetInstanceUID: 'display-set-1',
    StudyInstanceUID: 'study-1',
    SeriesInstanceUID: 'series-1',
    SeriesDescription: 'Chest CT',
    SeriesNumber: 1,
    Modality: 'CT',
    instances: [{ SOPInstanceUID: 'instance-1' }, { SOPInstanceUID: 'instance-2' }],
  };

  const servicesManager = {
    services: {
      displaySetService: {
        getDisplaySetByUID: jest.fn(uid => (uid === displaySet.displaySetInstanceUID ? displaySet : null)),
      },
      viewportGridService: {
        getActiveViewportId: jest.fn(() => 'viewport-1'),
        getState: jest.fn(() => ({
          activeViewportId: 'viewport-1',
          viewports: new Map([
            [
              'viewport-1',
              {
                viewportId: 'viewport-1',
                positionId: '0',
                displaySetInstanceUIDs: [displaySet.displaySetInstanceUID],
              },
            ],
          ]),
        })),
      },
      measurementService: {
        getMeasurements: jest.fn(filter => {
          const measurements = [
            {
              uid: 'measurement-1',
              label: 'Target lesion',
              type: 'Length',
              displaySetInstanceUID: 'display-set-1',
              referenceStudyUID: 'study-1',
              referenceSeriesUID: 'series-1',
              length: 12.4,
              PatientName: 'Should not leak',
            },
            {
              uid: 'measurement-2',
              label: 'Ignore me',
              type: 'Length',
              displaySetInstanceUID: 'display-set-2',
              referenceStudyUID: 'study-2',
              referenceSeriesUID: 'series-2',
              length: 7.1,
            },
          ];

          return typeof filter === 'function' ? measurements.filter(filter) : measurements;
        }),
      },
    },
  };

  beforeAll(() => {
    DicomMetadataStore.addSeriesMetadata([
      {
        StudyInstanceUID: 'study-1',
        StudyDescription: 'CT Chest',
        StudyDate: '20260414',
        ModalitiesInStudy: ['CT'],
        SeriesInstanceUID: 'series-1',
        SeriesDescription: 'Chest CT',
        SeriesNumber: 1,
        Modality: 'CT',
        PatientName: 'Alice Example',
        PatientID: 'P-001',
      },
    ]);

    DicomMetadataStore.addInstances([
      {
        StudyInstanceUID: 'study-1',
        SeriesInstanceUID: 'series-1',
        SOPInstanceUID: 'instance-1',
        StudyDescription: 'CT Chest',
      },
      {
        StudyInstanceUID: 'study-1',
        SeriesInstanceUID: 'series-1',
        SOPInstanceUID: 'instance-2',
        StudyDescription: 'CT Chest',
      },
    ]);
  });

  it('removes PHI fields recursively', () => {
    const result = redactPhi({
      PatientName: 'Alice',
      nested: {
        PatientID: '12345',
        keep: 'value',
      },
      array: [{ AccessionNumber: 'ACC-1', label: 'ok' }],
    });

    expect(result).toEqual({
      nested: {
        keep: 'value',
      },
      array: [{ label: 'ok' }],
    });
  });

  it('builds a redacted context using the active viewport and study measurements', () => {
    const context = buildReportContext(servicesManager);
    const serialized = JSON.stringify(context);

    expect(context.studyContext).toMatchObject({
      StudyInstanceUID: 'study-1',
      StudyDescription: 'CT Chest',
      numberOfSeries: 1,
    });
    expect(context.activeViewport).toMatchObject({
      viewportId: 'viewport-1',
      displaySetInstanceUIDs: ['display-set-1'],
    });
    expect(context.measurements).toHaveLength(1);
    expect(context.measurements[0]).toMatchObject({
      uid: 'measurement-1',
      label: 'Target lesion',
      length: 12.4,
    });
    expect(serialized).not.toContain('Alice Example');
    expect(serialized).not.toContain('P-001');
    expect(serialized).not.toContain('Should not leak');
  });
});
