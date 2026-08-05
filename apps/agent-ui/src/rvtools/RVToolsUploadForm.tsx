import {
  Alert,
  type DropEvent,
  Form,
  FormAlert,
  FormHelperText,
  HelperText,
  HelperTextItem,
  MultipleFileUpload,
  MultipleFileUploadMain,
  MultipleFileUploadStatus,
  MultipleFileUploadStatusItem,
} from "@patternfly/react-core";
import { UploadIcon } from "@patternfly/react-icons";
import type React from "react";
import { useState } from "react";

const RVTOOLS_ACCEPTED_EXTENSION = ".xlsx";

// Client-side convenience limit only — trivially bypassable and NOT a
// security control. Real validation happens server-side during ingestion.
// The backend's own upload size limit is still an open review item
// (see plan's "Security considerations"); revisit this number once it lands.
export const RVTOOLS_MAX_FILE_SIZE_BYTES = 200 * 1024 * 1024;

interface RejectedFileInfo {
  name: string;
  reason: string;
}

function hasValidExtension(file: File): boolean {
  return file.name.toLowerCase().endsWith(RVTOOLS_ACCEPTED_EXTENSION);
}

function formatMB(bytes: number): string {
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

interface RVToolsUploadFormProps {
  id: string;
  onSubmit: (files: File[]) => void;
  isSubmitting?: boolean;
  error?: string;
}

/**
 * Multi-file `.xlsx` picker for RVTools exports. Modeled on the VDDK
 * `FileUpload` precedent in `DeepInspectionModal.tsx`, but uses PatternFly's
 * `MultipleFileUpload` since the backend accepts multiple files per request.
 */
export const RVToolsUploadForm: React.FC<RVToolsUploadFormProps> = ({
  id,
  onSubmit,
  isSubmitting = false,
  error,
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const [rejectedFiles, setRejectedFiles] = useState<RejectedFileInfo[]>([]);

  const handleFileDrop = (_event: DropEvent, droppedFiles: File[]) => {
    const accepted: File[] = [];
    const rejected: RejectedFileInfo[] = [];

    for (const file of droppedFiles) {
      if (!hasValidExtension(file)) {
        rejected.push({
          name: file.name,
          reason: `Only ${RVTOOLS_ACCEPTED_EXTENSION} files are accepted`,
        });
        continue;
      }
      if (file.size > RVTOOLS_MAX_FILE_SIZE_BYTES) {
        rejected.push({
          name: file.name,
          reason: `File exceeds the ${formatMB(RVTOOLS_MAX_FILE_SIZE_BYTES)} limit`,
        });
        continue;
      }
      const isDuplicate = [...files, ...accepted].some(
        (existing) =>
          existing.name === file.name && existing.size === file.size,
      );
      if (isDuplicate) {
        continue;
      }
      accepted.push(file);
    }

    if (accepted.length > 0) {
      setFiles((prev) => [...prev, ...accepted]);
    }
    setRejectedFiles(rejected);
  };

  const handleRemoveFile = (fileToRemove: File) => {
    setFiles((prev) => prev.filter((file) => file !== fileToRemove));
  };

  const handleFormSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (files.length === 0 || isSubmitting) {
      return;
    }
    onSubmit(files);
  };

  return (
    <Form id={id} onSubmit={handleFormSubmit}>
      {error && (
        <FormAlert>
          <Alert variant="danger" title={error} aria-live="polite" isInline />
        </FormAlert>
      )}

      <MultipleFileUpload
        onFileDrop={handleFileDrop}
        dropzoneProps={{
          accept: {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":
              [RVTOOLS_ACCEPTED_EXTENSION],
          },
          disabled: isSubmitting,
        }}
      >
        <MultipleFileUploadMain
          titleIcon={<UploadIcon />}
          titleText="Drag and drop RVTools export files here"
          titleTextSeparator="or"
          infoText={`Accepted file type: ${RVTOOLS_ACCEPTED_EXTENSION}`}
          browseButtonText="Upload"
          isUploadButtonHidden={isSubmitting}
        />

        {rejectedFiles.length > 0 && (
          <Alert
            variant="warning"
            isInline
            isPlain
            title="Some files were not added"
            style={{ margin: "0 1rem 1rem" }}
          >
            {rejectedFiles.map((rejectedFile) => (
              <div key={rejectedFile.name}>
                {rejectedFile.name}: {rejectedFile.reason}
              </div>
            ))}
          </Alert>
        )}

        {files.length > 0 && (
          <MultipleFileUploadStatus
            statusToggleText={`${files.length} file${files.length !== 1 ? "s" : ""} selected`}
            aria-label="Selected RVTools files"
          >
            {files.map((file) => (
              <MultipleFileUploadStatusItem
                key={`${file.name}-${file.size}-${file.lastModified}`}
                file={file}
                // Skip the built-in FileReader read (unnecessary for large
                // .xlsx files and not needed since we don't preview contents).
                customFileHandler={() => {}}
                progressValue={100}
                progressVariant="success"
                onClearClick={() => handleRemoveFile(file)}
              />
            ))}
          </MultipleFileUploadStatus>
        )}
      </MultipleFileUpload>

      <FormHelperText>
        <HelperText>
          <HelperTextItem variant={files.length === 0 ? "indeterminate" : "success"}>
            {files.length === 0
              ? "Select at least one .xlsx file to continue."
              : `${files.length} file${files.length !== 1 ? "s" : ""} ready to upload.`}
          </HelperTextItem>
        </HelperText>
      </FormHelperText>
    </Form>
  );
};

RVToolsUploadForm.displayName = "RVToolsUploadForm";
