import { type VariantReviewSession } from "./core/variantReviewSession";
import { buildVariantGenerationPackage, type VariantRequestInput } from "./variantRequest";
import { VariantReviewController, type VariantReviewView } from "./variantReviewController";
import { type WorkspaceAsset } from "./workspaceAsset";

export type VariantSessionStarter = (
  selectedAsset: WorkspaceAsset,
  generationPackage: ReturnType<typeof buildVariantGenerationPackage>,
) => Promise<VariantReviewSession>;

export class VariantWorkflow {
  private readonly reviewController: VariantReviewController;
  private readonly startSession: VariantSessionStarter;

  constructor(reviewController: VariantReviewController, startSession: VariantSessionStarter) {
    this.reviewController = reviewController;
    this.startSession = startSession;
  }

  async start(selectedAsset: WorkspaceAsset, input: VariantRequestInput): Promise<VariantReviewView> {
    if (this.reviewController.hasActiveReview) {
      throw new Error("A Generate Variant review is already active.");
    }

    const generationPackage = buildVariantGenerationPackage(selectedAsset, input);
    const session = await this.startSession(selectedAsset, generationPackage);

    try {
      return this.reviewController.begin(session);
    } catch (error) {
      if (session.status === "reviewing") {
        session.reject();
      }
      throw error;
    }
  }
}
