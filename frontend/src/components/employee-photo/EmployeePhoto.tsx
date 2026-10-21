import { useCallback } from "react";
import { SOURCE_LABELS } from "../../data/dataSource.ts";
import { useDataSource } from "../../data/store.ts";
import { formatMs } from "../../utils/format.ts";
import { useAsync } from "../../utils/hooks.ts";
import "./EmployeePhoto.css";

interface EmployeePhotoProps {
  employeeId: number;
  size: number;
}

export function EmployeePhoto({ employeeId, size }: EmployeePhotoProps) {
  const dataSource = useDataSource();
  const loadPhoto = useCallback(
    (signal: AbortSignal) => dataSource.getPhoto(employeeId, signal),
    [dataSource, employeeId],
  );
  const photo = useAsync(loadPhoto);
  const loaded = photo.loading ? undefined : photo.data;
  const blob = loaded?.data;

  const showBlob = useCallback(
    (image: HTMLImageElement | null) => {
      if (!image || !blob) return;
      const url = URL.createObjectURL(blob);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [blob],
  );

  const style = { width: size, height: size };
  if (!loaded) return <span className="employee-photo" style={style} aria-hidden="true" />;

  return (
    <img
      ref={showBlob}
      className="employee-photo"
      style={style}
      width={size}
      height={size}
      alt=""
      title={`Photo loaded in ${formatMs(loaded.totalMs)} · ${SOURCE_LABELS[loaded.source]}`}
    />
  );
}
