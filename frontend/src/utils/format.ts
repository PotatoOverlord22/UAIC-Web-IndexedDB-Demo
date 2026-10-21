const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric" });
const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });

export const formatMs = (ms: number) => (ms < 10 ? `${ms.toFixed(1)} ms` : `${Math.round(ms)} ms`);

export const formatCount = (count: number) => count.toLocaleString("en-US");

export const formatMegabytes = (bytes = 0) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

export const formatDate = (isoDate: string) => dateFormat.format(new Date(isoDate));

export const formatDateTime = (isoDate: string) => dateTimeFormat.format(new Date(isoDate));
