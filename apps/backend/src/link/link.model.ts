export type Link = {
  id: string;
  slug: string;
  destinationUrl: string;
  createdAt: Date;
};

export type CreateLinkRecord = {
  slug: string;
  destinationUrl: string;
};
