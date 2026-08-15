import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService
  ) {}

  async login(email: string, password: string) {
    const user = await this.ensureDemoUser(email);
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name }
    };
  }

  async register(email: string, password: string, name?: string) {
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('E-mail já cadastrado');
    }
    const user = this.users.create({
      email,
      name: name || email.split('@')[0],
      passwordHash: await bcrypt.hash(password, 10)
    });
    await this.users.save(user);
    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email }),
      user: { id: user.id, email: user.email, name: user.name }
    };
  }

  private async ensureDemoUser(email: string) {
    let user = await this.users.findOne({ where: { email } });
    if (!user && email === 'admin@demo.com') {
      user = this.users.create({
        email,
        name: 'Demo Merchant',
        passwordHash: await bcrypt.hash('123456', 10)
      });
      await this.users.save(user);
    }
    if (!user) {
      throw new UnauthorizedException('Usuário não encontrado');
    }
    return user;
  }
}

