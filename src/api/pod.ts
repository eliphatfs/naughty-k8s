import * as vscode from 'vscode';
import * as api from '.';

interface PodModel {
    metadata: { name: string }
}

export async function listPods(): Promise<PodModel[]> {
    const resp = await api.client.get(`/api/v1/namespaces/${api.ns()}/pods`);
    return resp.data.items;
}
