import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GamesService, standardizeName } from './games.service';
import { Game } from '../entities';

describe('standardizeName', () => {
  it('removes trademark symbols', () => {
    expect(standardizeName('Game™ Name®©')).toBe('Game Name');
  });

  it('normalizes unicode to ASCII', () => {
    expect(standardizeName('café résumé')).toBe('Cafe Resume');
  });

  it('collapses multiple spaces and trims', () => {
    expect(standardizeName('  hello   world  ')).toBe('Hello World');
  });

  it('title-cases words', () => {
    expect(standardizeName('the LAST of us')).toBe('The Last Of Us');
  });

  it('handles mixed concerns together', () => {
    expect(standardizeName('  Elden Ring™  —  édition  ')).toBe(
      'Elden Ring — Edition',
    );
  });

  it('handles an empty string', () => {
    expect(standardizeName('')).toBe('');
  });

  it('handles alphanumeric words properly', () => {
    expect(standardizeName('half-life 2')).toBe('Half-life 2');
  });
});

describe('GamesService', () => {
  let service: GamesService;
  let repo: jest.Mocked<
    Pick<Repository<Game>, 'findOne' | 'find' | 'create' | 'save'>
  >;

  beforeEach(async () => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GamesService,
        {
          provide: getRepositoryToken(Game),
          useValue: repo,
        },
      ],
    }).compile();

    service = module.get<GamesService>(GamesService);
  });

  describe('findOrCreate', () => {
    it('returns existing game when found by slug', async () => {
      const existing = {
        id: '1',
        name: 'Elden Ring',
        slug: 'elden-ring',
      } as Game;
      repo.findOne.mockResolvedValue(existing);

      const result = await service.findOrCreate('elden ring');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { slug: 'elden-ring' },
      });
      expect(repo.create).not.toHaveBeenCalled();
      expect(result).toBe(existing);
    });

    it('creates a new game when not found', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: '2',
        name: 'Elden Ring',
        slug: 'elden-ring',
      } as Game;
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      const result = await service.findOrCreate('elden ring');

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { slug: 'elden-ring' },
      });
      expect(repo.create).toHaveBeenCalledWith({
        name: 'Elden Ring',
        slug: 'elden-ring',
      });
      expect(repo.save).toHaveBeenCalledWith(created);
      expect(result).toBe(created);
    });

    it('standardizes name before lookup', async () => {
      repo.findOne.mockResolvedValue(null);
      const created = {
        id: '3',
        name: 'Game Name',
        slug: 'game-name',
      } as Game;
      repo.create.mockReturnValue(created);
      repo.save.mockResolvedValue(created);

      await service.findOrCreate('  game™  NAME  ');

      expect(repo.create).toHaveBeenCalledWith({
        name: 'Game Name',
        slug: 'game-name',
      });
    });
  });

  describe('search', () => {
    it('performs case-insensitive LIKE search with max 20 results', async () => {
      const games = [
        { id: '1', name: 'Elden Ring', slug: 'elden-ring' },
      ] as Game[];
      repo.find.mockResolvedValue(games);

      const result = await service.search('elden');

      expect(repo.find).toHaveBeenCalledWith({
        where: { name: expect.objectContaining({}) as unknown },
        take: 20,
      });
      expect(result).toBe(games);
    });

    it('standardizes the query before searching', async () => {
      repo.find.mockResolvedValue([]);

      await service.search('  ELDEN™  ring  ');

      // The ILike call should use the standardized name
      const callArgs = repo.find.mock.calls[0][0] as {
        where: { name: { _value: string } };
      };
      // ILike('%Elden Ring%') - we check the argument structure
      expect(callArgs.where.name._value).toBe('%Elden Ring%');
    });

    it('returns empty array when no matches', async () => {
      repo.find.mockResolvedValue([]);
      const result = await service.search('nonexistent');
      expect(result).toEqual([]);
    });
  });
});
