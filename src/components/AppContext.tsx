import { useState } from "react";
import { createContainer } from 'react-tracked';
import { Context } from "../types";

type AppState = {
  filepath: string;
  ctx: Context;
}

const initialState: AppState = {
  filepath: "/workspace/README.md",
  ctx: null as any,
};

const useValue = () => useState(initialState);

export const { Provider, useTracked, useSelector, useTrackedState, useUpdate } = createContainer(useValue);
export const useActions = () => {
  useSelector((state) => state.ctx.actions);
}