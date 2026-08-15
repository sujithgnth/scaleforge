{{- define "scaleforge.name" -}}
scaleforge
{{- end }}

{{- define "scaleforge.fullname" -}}
{{ .Release.Name }}-scaleforge
{{- end }}

{{- define "scaleforge.labels" -}}
app.kubernetes.io/name: {{ include "scaleforge.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}
